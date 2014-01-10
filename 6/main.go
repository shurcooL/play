// +build ignore

package main

import (
	"github.com/marpaia/chef-golang"
	"github.com/shurcooL/go-goon"
)

var _ = goon.Dump

func main() {
	c, err := chef.Connect()
	if err != nil {
		panic(err)
	}
	c.SSLNoVerify = true

	nodes, err := c.GetNodes()
	if err != nil {
		panic(err)
	}

	goon.DumpExpr(nodes)
}
