package main

import "fmt"

func main() {
	defer func() {
		e := recover()
		fmt.Printf("%q\n", e)
	}()

	var foo Foo // nil interface value
	foo.Foo()
}

type Foo interface {
	Foo()
}
