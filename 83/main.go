package main

import (
	"fmt"

	"github.com/juju/errgo"
)

func Foo() error {
	return errgo.New("errgo error in Foo")
}

func main() {
	err := Foo()
	if err != nil {
		fmt.Println(errgo.Details(err))
	}
}
