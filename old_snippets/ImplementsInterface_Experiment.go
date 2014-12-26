// +build ignore

package main

import (
	"fmt"
	"go/ast"
	"reflect"
)

type Closer interface {
	Close() bool
}

type Boo struct {
	X int
}

func (w *Boo) Close() bool {
	return w.X != 0
}

func main() {
	var _ = ast.FileExports
	var _ = fmt.Print

	x := reflect.TypeOf((**Boo)(nil)).Elem()
	y := reflect.TypeOf((*Closer)(nil)).Elem()

	println(x.String())
	println(y.String())
	println(x.Implements(y))
}