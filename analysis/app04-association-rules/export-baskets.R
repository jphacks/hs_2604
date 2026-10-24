# Converts the arules "transactions" object to one basket per line (items joined by "|").
# Uses base R only: Rscript export-baskets.R raw/Groceries.rda raw/baskets.txt
args <- commandArgs(trailingOnly = TRUE)
suppressWarnings(load(args[1]))
d <- attr(Groceries, "data"); i <- attr(d, "i"); p <- attr(d, "p")
labels <- as.character(attr(Groceries, "itemInfo")$labels)
lines <- vapply(seq_len(length(p) - 1), function(t) {
  idx <- if (p[t + 1] > p[t]) i[(p[t] + 1):p[t + 1]] + 1 else integer(0)
  paste(labels[idx], collapse = "|")
}, character(1))
writeLines(lines, args[2], useBytes = TRUE)
