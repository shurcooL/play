package main

import (
	"os"
	"strings"

	"github.com/dchest/htmlmin"
	"github.com/shurcooL/go-goon"
	"golang.org/x/net/html"
)

func main2() {
	/*f, err := os.Open("/Users/Dmitri/Dropbox/Public/dmitri/index.html")
	if err != nil {
		panic(err)
	}
	defer f.Close()*/

	f := strings.NewReader(`<html><head><title>This is a title</title>


</head><body></body></html>`)

	n, err := html.Parse(f)
	if err != nil {
		panic(err)
	}

	goon.DumpExpr(n)

	err = html.Render(os.Stdout, n)
	if err != nil {
		panic(err)
	}
}

func main() {
	in := []byte(`<html><head><title>This is a title</title>


</head><body></body></html>`)

	out, err := htmlmin.Minify(in, nil)
	if err != nil {
		panic(err)
	}
	os.Stdout.Write(out)
}
