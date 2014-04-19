package main

import (
	"fmt"
	"reflect"

	"github.com/shurcooL/go-goon"
)

type MagicType string

func IntToMagicType(in int) MagicType {
	return MagicType(fmt.Sprint(in))
}

func main() {
	goon.DumpExpr(IntToMagicType(7))

	x := reflect.TypeOf(IntToMagicType)

	goon.Dump(x.String())

	goon.Dump(x.NumOut())

	for out := 0; out < x.NumOut(); out++ {
		goon.Dump(x.Out(out).String())
	}
}
