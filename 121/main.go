// Play with go/doc.ToHTML and html_to_markdown.
package main

import (
	"bytes"
	"fmt"
	"go/doc"

	"golang.org/x/net/html"

	"github.com/shurcooL/go/html_to_markdown"
)

func main() {
	var buf = new(bytes.Buffer)
	doc.ToHTML(buf, `Package gl is a Go cross-platform binding for OpenGL, with an OpenGL ES 2-like API.

It supports:

- OS X, Linux and Windows via OpenGL/OpenGL ES backends,

- iOS and Android via OpenGL ES backend,

- Modern Browsers (desktop and mobile) via WebGL 1 backend.

This is a fork of golang.org/x/mobile/gl/... packages with [CL 8793](https://go-review.googlesource.com/8793)
merged in. This package may change as that CL is reviewed, and hopefully eventually deleted once
the CL is merged and golang.org/x/mobile/gl/... can be used.

Usage notes

Usage goes like this.`, nil)

	n, err := html.Parse(buf)
	if err != nil {
		panic(err)
	}
	md := html_to_markdown.Document(n)
	fmt.Println(md)
}
