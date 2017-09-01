package main

import (
	"fmt"

	"github.com/shurcooL/play/230/lib"
)

type X struct {
	S string
}

func (x X) MethodOnType() string {
	return "type method: " + x.S
}

type A = X

func (a A) MethodOnAlias() string {
	return "alias method: " + a.S
}

func main() {
	var a A = A{S: "aliases working"}
	fmt.Printf("%T\n", a)
	fmt.Println(a)
	fmt.Println(a.MethodOnType())
	fmt.Println(a.MethodOnAlias())

	//var la lib.A = lib.A{S: "aliases working"}
	//fmt.Printf("%T %v %v\n", la, la, la.Method())

	//fmt.Println(runtime.Version())

	lib.DoStuff()
}
