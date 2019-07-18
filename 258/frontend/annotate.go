package main

import (
	"go/ast"
	"go/token"

	"github.com/sourcegraph/annotate"
	"github.com/sourcegraph/syntaxhighlight"
)

// htmlAnnotator is like the default HTML annotator, except it doesn't annotate plain text.
var htmlAnnotator = func() syntaxhighlight.Annotator {
	var c = syntaxhighlight.HTMLAnnotator(syntaxhighlight.DefaultHTMLConfig)
	c.Plaintext = "" // Do not annotate plain text since it's not decorated.
	return c
}()

// fileOffset returns the offset of pos within its file.
func fileOffset(fset *token.FileSet, pos token.Pos) int {
	return fset.File(pos).Offset(pos)
}

// annotateNode annonates the given node with left and right.
func annotateNode(fset *token.FileSet, node ast.Node, left, right string, level int) *annotate.Annotation {
	return &annotate.Annotation{
		Start:     fileOffset(fset, node.Pos()),
		End:       fileOffset(fset, node.End()),
		WantInner: level,

		Left:  []byte(left),
		Right: []byte(right),
	}
}

// annotateNodes annonates the given nodes with left and right.
func annotateNodes(fset *token.FileSet, node0, node1 ast.Node, left, right string, level int) *annotate.Annotation {
	return &annotate.Annotation{
		Start:     fileOffset(fset, node0.Pos()),
		End:       fileOffset(fset, node1.End()),
		WantInner: level,

		Left:  []byte(left),
		Right: []byte(right),
	}
}
