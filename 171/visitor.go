package main

import (
	"fmt"
	"go/ast"
	"strings"

	"github.com/shurcooL/htmlg"
	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

type Node struct {
	Parent   *Node
	Children []Node
	Depth    int

	Node ast.Node
}

type visitor struct {
	Root Node

	ptr   *Node
	depth int
}

func NewVisitor() *visitor {
	v := &visitor{}
	v.ptr = &v.Root
	return v
}

// ▶
// ▼

func (v *visitor) Visit(node ast.Node) ast.Visitor {
	switch node {
	default:
		/*text := strings.Repeat("\t", v.depth)
		text += fmt.Sprintf("▶▼%T", node)
		if src := source.Value[node.Pos()-1 : node.End()-1]; !strings.Contains(src, "\n") {
			text += fmt.Sprintf(": %s", src)
		}
		n := htmlg.DivClass("node", htmlg.Text(text))

		v.nodes = append(v.nodes, n)*/

		v.ptr.Children = append(v.ptr.Children, Node{
			Parent: v.ptr,
			Node:   node,
			Depth:  v.depth,
		})
		v.ptr = &v.ptr.Children[len(v.ptr.Children)-1]

		v.depth++
	case nil:
		v.depth--

		v.ptr = v.ptr.Parent
	}
	return v
}

func visit(node Node) []*html.Node {
	switch len(node.Children) {
	case 0:
		return renderNode(node)
	default:
		var nodes []*html.Node
		nodes = append(nodes, renderNode(node)...)
		for _, c := range node.Children {
			nodes = append(nodes, visit(c)...)
		}
		nodes = append(nodes, nodeDiv(node, false, htmlg.Text("}")))
		return nodes
	}
}

func renderNode(n Node) []*html.Node {
	var text string
	text = fmt.Sprintf("%T", n.Node)
	if !strings.HasPrefix(text, "*ast.") {
		panic(text)
	}
	text = text[len("*ast."):]
	if len(n.Children) == 0 {
		text += fmt.Sprintf(": %s", source.Value[n.Node.Pos()-1:n.Node.End()-1])
	} else {
		text = "▼" + text + "{"
	}
	return []*html.Node{nodeDiv(n, len(n.Children) != 0, htmlg.Text(text))}
}

func nodeDiv(node Node, triangle bool, nodes ...*html.Node) *html.Node {
	padding := 12 * node.Depth
	if triangle {
		padding -= 7
	}
	div := &html.Node{
		Type: html.ElementNode, Data: atom.Div.String(),
		Attr: []html.Attribute{
			{Key: atom.Class.String(), Val: "node"},
			{Key: atom.Style.String(), Val: fmt.Sprintf("padding-left: %vpx;", padding)},
			{Key: atom.Onmouseover.String(), Val: "MouseOver(this);"},
			{Key: atom.Onmouseout.String(), Val: "MouseOut();"},
			{Key: "data-pos", Val: fmt.Sprint(node.Node.Pos() - 1)},
			{Key: "data-end", Val: fmt.Sprint(node.Node.End() - 1)},
		},
	}
	htmlg.AppendChildren(div, nodes...)
	return div
}
