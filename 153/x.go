// +build ignore

package main

import "fmt"

func main() {
	type Inner struct {
		Field1 string
		Field2 int
	}

	var myVariable = (*Inner)(&Inner{
		Field1: (string)("Secret!"),
		Field2: (int)(0),
	})

	fmt.Println(myVariable)
}
