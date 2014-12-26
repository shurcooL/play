// +build ignore

package main

import (
	"go/parser"
	"go/token"
	"github.com/shurcooL/go-goon"
)

func main() {
	src := `package zk

import (
	"errors"
)

const (
	protocolVersion = 0

	defaultPort = 2181
)`

	f, err := parser.ParseFile(token.NewFileSet(), "", src, 0)

	goon.Dump(f, err)
}