package main

import (
	"fmt"
	"strings"

	. "gist.github.com/6418290.git"

	"github.com/shurcooL/go-goon"
)

func BlockCode(someNumber int, text, lang string) {
	fmt.Println(GetParentFuncAsString())
	goon.DumpExpr(someNumber, text, lang)

	fmt.Println(GetParentFuncArgsAsString(someNumber, text, lang))

	//fmt.Println(string(debug.Stack()))
}

func main() {
	i := 1335
	xyz := "Go"
	BlockCode(i, strings.Join([]string{"this", "is", "the", "text"}, "-"), xyz)
}
