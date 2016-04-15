// Play with go-travis API client library.
package main

import (
	"log"

	"github.com/Ableton/go-travis"
	"github.com/shurcooL/go-goon"
)

var client = travis.NewDefaultClient("")

func mainx() {
	r, c, resp, err := client.Requests.ListFromRepository("kisielk/errcheck", nil)
	if err != nil {
		log.Fatalln(err)
	}

	goon.DumpExpr(resp.Status)
	goon.DumpExpr(r)
	goon.DumpExpr(c)
}

func mainc() {
	b, resp, err := client.Branches.GetFromSlug("shurcooL-legacy/htmlg", "bad-change")
	if err != nil {
		log.Fatalln(err)
	}

	goon.DumpExpr(resp.Status)
	goon.DumpExpr(b)
}

func main() {
	b, j, c, resp, err := client.Builds.ListFromRepository("shurcooL-legacy/htmlg", nil)
	if err != nil {
		log.Fatalln(err)
	}

	goon.DumpExpr(resp.Status)
	goon.DumpExpr(len(b), len(j), len(c))
	goon.DumpExpr(b)
	goon.DumpExpr(j)
	goon.DumpExpr(c)
}
