// Play around with RelMeAuth.
package main

import (
	"fmt"
	"net/http"
	"os"
	"strings"

	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

func main() {
	for _, arg := range os.Args[1:] {
		if err := title(arg); err != nil {
			fmt.Fprintf(os.Stderr, "title: %v\n", err)
		}
	}
}

func title(url string) error {
	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	ct := resp.Header.Get("Content-Type")
	if ct != "text/html" && !strings.HasPrefix(ct, "text/html;") {
		return fmt.Errorf("%s has type %s, not text/html", url, ct)
	}

	doc, err := html.Parse(resp.Body)
	if err != nil {
		return fmt.Errorf("parsing %s as HTML: %v", url, err)
	}

	visitNode := func(n *html.Node) {
		// <link href="https://github.com/dmitshur" rel="me">
		// <a href="https://github.com/aaronpk" rel="me"><i class="github icon"></i></a>
		if n.Type == html.ElementNode && (n.Data == atom.Link.String() || n.Data == atom.A.String()) && hasRelMe(n) {
			fmt.Println(getHref(n))
		}
	}
	forEachNode(doc, visitNode, nil)

	return nil
}

func hasRelMe(n *html.Node) bool {
	for _, a := range n.Attr {
		if a.Key == "rel" && a.Val == "me" && a.Namespace == "" {
			return true
		}
	}
	return false
}

func getHref(n *html.Node) string {
	for _, a := range n.Attr {
		if a.Key == "href" && a.Namespace == "" {
			return a.Val
		}
	}
	return ""
}

func forEachNode(n *html.Node, pre, post func(n *html.Node)) {
	if pre != nil {
		pre(n)
	}
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		forEachNode(c, pre, post)
	}
	if post != nil {
		post(n)
	}
}
