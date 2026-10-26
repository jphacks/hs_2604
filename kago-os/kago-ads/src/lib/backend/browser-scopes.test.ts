import {it,expect,vi,afterEach} from "vitest";
import {createBrowserBackend} from "../../../../shared/backend/src/clients";
afterEach(()=>{vi.unstubAllGlobals();});
it("同じCookie範囲だけでブラウザクライアントを再利用する",()=>{
 vi.stubGlobal("window",{});
 const config={url:"https://scope-one.example.test",publishableKey:"sb_publishable_fixture"};
 const ads=createBrowserBackend(config,{name:"ads",path:"/"}),signage=createBrowserBackend(config,{name:"signage",path:"/signage"});
 expect(ads).not.toBe(signage);expect(createBrowserBackend(config,{name:"ads",path:"/"})).toBe(ads);
});
it("同じCookie名でもpathや接続先が違えば混ぜない",()=>{
 vi.stubGlobal("window",{});
 const config={url:"https://scope-two.example.test",publishableKey:"sb_publishable_fixture"};
 const a=createBrowserBackend(config,{name:"x",path:"/a"}),b=createBrowserBackend(config,{name:"x",path:"/b"});
 const c=createBrowserBackend({...config,url:"https://other.example.test"},{name:"x",path:"/a"});
 expect(a).not.toBe(b);expect(a).not.toBe(c);
});
it("SSRではブラウザのキャッシュも他のリクエストも共有しない",()=>{
 const config={url:"https://scope-three.example.test",publishableKey:"sb_publishable_fixture"};
 vi.stubGlobal("window",{});const browser=createBrowserBackend(config,{name:"x",path:"/"});
 vi.unstubAllGlobals();const a=createBrowserBackend(config,{name:"x",path:"/"}),b=createBrowserBackend(config,{name:"x",path:"/"});
 expect(a).not.toBe(browser);expect(a).not.toBe(b);
});
