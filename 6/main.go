package main

import (
	"fmt"

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

	results, err := c.Search("node", "role:google_go")
	if err != nil {
		panic(err)
	}

	fmt.Println(results.Total)
	//goon.DumpExpr(results)
	for _, row := range results.Rows {
		row := row.(map[string]interface{})

		fmt.Println(row["name"])
	}

	return

	nodes, err := c.GetNodes()
	if err != nil {
		panic(err)
	}

	goon.DumpExpr(nodes)
}
