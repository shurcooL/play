package main

import "fmt"

type T int

func (t T) Foo() { fmt.Println("t is", t) }

func main() {
	var t T = 123
	t.Foo()
	T.Foo(1234)
}
