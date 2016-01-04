package main

import (
	"fmt"
	"go/ast"
	"strings"

	"github.com/shurcooL/htmlg"
	"golang.org/x/net/html"
)

type visitor struct {
	nodes []*html.Node

	depth int
}

func (v *visitor) Visit(node ast.Node) ast.Visitor {
	switch node {
	default:
		text := strings.Repeat("\t", v.depth)
		text += fmt.Sprintf("%T", node)
		if src := source.Value[node.Pos()-1 : node.End()-1]; !strings.Contains(src, "\n") {
			text += fmt.Sprintf(": %s", src)
		}
		n := htmlg.DivClass("node", htmlg.Text(text))

		v.nodes = append(v.nodes, n)

		v.depth++
		return v
	case nil:
		v.depth--
		return v
	}
}
