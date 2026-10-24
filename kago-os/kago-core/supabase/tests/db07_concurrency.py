"""PostgreSQL 16 integration test. Requires pg8000; see README.md.

Creates fixtures only in an EMPTY local database named kago_checkout_test_*.
Uses real row-lock waits, not timed assumptions, to order the two connections.
"""
import concurrent.futures
import os
from pathlib import Path
import time
from uuid import uuid4

from pg8000.native import Connection
from pg8000.exceptions import DatabaseError

ROOT = Path(__file__).resolve().parents[1]
HOST = os.environ.get('KAGO_TEST_PG_HOST', '127.0.0.1')
DATABASE = os.environ.get('KAGO_TEST_PG_DATABASE', '')
if HOST not in ('127.0.0.1', 'localhost', '::1') or not DATABASE.startswith('kago_checkout_test_'):
    raise SystemExit('Use an EMPTY local kago_checkout_test_* database; shared Supabase is forbidden.')


def connect():
    connection = Connection(user=os.environ.get('KAGO_TEST_PG_USER', 'postgres'),
                      password=os.environ.get('KAGO_TEST_PG_PASSWORD', ''), host=HOST,
                      port=int(os.environ.get('KAGO_TEST_PG_PORT', '5432')), database=DATABASE,
                      timeout=15)
    connection.run("set client_encoding='UTF8'")
    connection.run("set statement_timeout='10s'")
    return connection


def assert_blocked(observer, waiting, blocking):
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        if observer.run('select :blocker = any(pg_blocking_pids(:waiter))',
                        blocker=blocking, waiter=waiting)[0][0]:
            return
        time.sleep(.02)
    raise AssertionError('Expected row-lock wait was not observed')


def customer(connection, user):
    connection.run('begin')
    connection.run("select set_config('request.jwt.claim.sub', :user, true)", user=user)
    connection.run("select set_config('request.jwt.claims', :claims, true)",
                   claims='{"app_metadata":{"kago":{"roles":["customer"]}}}')
    connection.run('set local role authenticated')


def checkout(connection, visit, key):
    return connection.run('select * from public.kago_checkout(:visit, :key, 1, 248)', visit=visit, key=key)


def fixture(owner):
    user, store, product, visit = [str(uuid4()) for _ in range(4)]
    owner.run('insert into auth.users(id,email) values (:id,:email)', id=user, email=f'{user}@example.test')
    owner.run("insert into public.stores(id,slug,name) values (:id,:slug,'Test store')", id=store, slug=f'test-{store}')
    owner.run("insert into public.products(id,code,name,category) values (:id,:code,'Test pasta','pasta')", id=product, code=product)
    owner.run('insert into public.store_products(store_id,product_id,price) values (:s,:p,248)', s=store, p=product)
    owner.run('insert into public.visits(id,user_id,store_id) values (:v,:u,:s)', v=visit, u=user, s=store)
    owner.run('insert into public.cart_items(visit_id,product_id,quantity) values (:v,:p,1)', v=visit, p=product)
    owner.run('update public.visits set cart_version=1 where id=:v', v=visit)
    return user, store, product, visit


def edit(connection, store, product, stop):
    if stop:
        connection.run('update public.store_products set is_active=false where store_id=:s and product_id=:p', s=store, p=product)
    else:
        connection.run('update public.store_products set price=300 where store_id=:s and product_id=:p', s=store, p=product)


def edit_first(owner, stop, original=False):
    user, store, product, visit = fixture(owner)
    editor, buyer = connect(), connect()
    try:
        editor.run('begin')
        edit(editor, store, product, stop)
        customer(buyer, user)
        editor_pid, buyer_pid = [c.run('select pg_backend_pid()')[0][0] for c in (editor, buyer)]
        with concurrent.futures.ThreadPoolExecutor() as pool:
            future = pool.submit(checkout, buyer, visit, str(uuid4()))
            try:
                assert_blocked(owner, buyer_pid, editor_pid)
            finally:
                editor.run('commit')
            error = None
            try:
                future.result(timeout=10)
            except DatabaseError as exc:
                error = exc.args[0]
            if original:
                assert error is None, error
            else:
                assert error and error['C'] == ('23514' if stop else '40001'), error
                if not stop:
                    assert error.get('D') == 'price_changed', error
        buyer.run('commit' if original else 'rollback')
        if original:
            rows = owner.run('select o.total,i.unit_price*i.quantity from public.orders o join public.order_items i on i.order_id=o.id where o.visit_id=:v', v=visit)
            assert rows == [[248, 300]], rows
            print('Original DB-07 race reproduced: total=248, line total=300')
        else:
            assert owner.run('select count(*) from public.orders where visit_id=:v', v=visit)[0][0] == 0
            assert owner.run('select status from public.visits where id=:v', v=visit)[0][0] == 'active'
            print(f'Edit first ({"stop" if stop else "price"}): rejected, no partial order')
    finally:
        editor.close()
        buyer.close()


def checkout_first(owner, stop):
    user, store, product, visit = fixture(owner)
    editor, buyer = connect(), connect()
    try:
        customer(buyer, user)
        key = str(uuid4())
        result = checkout(buyer, visit, key)
        assert result[0][1] == 248 and result[0][3] is False, result
        editor_pid, buyer_pid = [c.run('select pg_backend_pid()')[0][0] for c in (editor, buyer)]
        with concurrent.futures.ThreadPoolExecutor() as pool:
            future = pool.submit(edit, editor, store, product, stop)
            try:
                assert_blocked(owner, editor_pid, buyer_pid)
            finally:
                buyer.run('commit')
            future.result(timeout=10)
        assert owner.run('select o.total,sum(i.unit_price*i.quantity) from public.orders o join public.order_items i on i.order_id=o.id where o.visit_id=:v group by o.id', v=visit) == [[248, 248]]
        customer(buyer, user)
        replay = checkout(buyer, visit, key)
        assert replay[0][0] == result[0][0] and replay[0][3] is True, replay
        buyer.run('commit')
        print(f'Checkout first ({"stop" if stop else "price"}): matching totals, update waits, replay succeeds')
    finally:
        editor.close()
        buyer.close()


def main():
    owner = connect()
    try:
        assert owner.run("select count(*) from pg_tables where schemaname in ('public','auth')")[0][0] == 0, 'Database must be empty'
        owner.run("""do $$begin
            if not exists(select from pg_roles where rolname='anon') then create role anon; end if;
            if not exists(select from pg_roles where rolname='authenticated') then create role authenticated; end if;
            if not exists(select from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
            end$$;
            create schema auth; create table auth.users(id uuid primary key,email text);
            create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
            create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;
            grant usage on schema public,auth to anon,authenticated,service_role;
            alter default privileges in schema public grant all on tables to anon,authenticated,service_role;""")
        for migration in sorted((ROOT / 'migrations').glob('*.sql')):
            owner.run(migration.read_text())
        print(owner.run('select version()')[0][0])
        for test in sorted((ROOT / 'tests').glob('db??.sql')):
            for _ in range(2):
                owner.run(test.read_text())
            print(f'{test.name}: passed twice')
        # Prove the original defect before verifying the replacement, in this disposable DB only.
        original = (ROOT / 'migrations/20261024080000_checkout.sql').read_text().replace('create function public.kago_checkout(', 'create or replace function public.kago_checkout(', 1)
        owner.run(original)
        edit_first(owner, stop=False, original=True)
        owner.run((ROOT / 'migrations/20261024110000_checkout_price_lock.sql').read_text())
        for _ in range(2):
            edit_first(owner, stop=False)
            edit_first(owner, stop=True)
            checkout_first(owner, stop=False)
            checkout_first(owner, stop=True)
        print('DB-07 concurrency: all assertions passed')
    finally:
        owner.close()


if __name__ == '__main__':
    main()
