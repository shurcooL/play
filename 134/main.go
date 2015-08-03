package main

import (
	"strings"

	"github.com/shurcooL/go-goon"
	"golang.org/x/net/html"
)

func main() {
	in := strings.NewReader(`<pre>
<a href="scroll.html">scroll.html</a>
<a href="touch-ws.html">touch-ws.html</a>
<a href="touch.html">touch.html</a>
</pre>`)

	n, err := html.Parse(in)
	if err != nil {
		panic(err)
	}

	var f func(*html.Node)
	f = func(n *html.Node) {
		if n.Type == html.ElementNode && n.Data == "a" {
			goon.DumpExpr(n.Data, n.Attr)
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			f(c)
		}
	}
	f(n)
}
