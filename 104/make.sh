#!/bin/bash

mkdir ./build

go version > ./build/go_version.txt
gostatus -v -debug github.com/gopherjs/gopherjs | awk -F '"' '{ print $16 }' > ./build/gopherjs_version.txt

# Go.
go build -o ./build/simple               simple.go
go build -o ./build/fmt_simple           fmt_simple.go
go build -o ./build/peg_solitaire_solver peg_solitaire_solver.go
go build -o ./build/markdownfmt          markdownfmt.go

# GopherJS.
gopherjs build -o ./build/simple.js               simple.go
gopherjs build -o ./build/fmt_simple.js           fmt_simple.go
gopherjs build -o ./build/peg_solitaire_solver.js peg_solitaire_solver.go
gopherjs build -o ./build/markdownfmt.js          markdownfmt.go

# GopherJS, minify.
gopherjs build -m -o ./build/simple_min.js               simple.go
gopherjs build -m -o ./build/fmt_simple_min.js           fmt_simple.go
gopherjs build -m -o ./build/peg_solitaire_solver_min.js peg_solitaire_solver.go
gopherjs build -m -o ./build/markdownfmt_min.js          markdownfmt.go

# GopherJS, gzip.
gzip -9 -k -f ./build/simple.js
gzip -9 -k -f ./build/fmt_simple.js
gzip -9 -k -f ./build/peg_solitaire_solver.js
gzip -9 -k -f ./build/markdownfmt.js

# GopherJS, minify, gzip.
gzip -9 -k -f ./build/simple_min.js
gzip -9 -k -f ./build/fmt_simple_min.js
gzip -9 -k -f ./build/peg_solitaire_solver_min.js
gzip -9 -k -f ./build/markdownfmt_min.js

rm ./build/*.map
