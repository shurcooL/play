// +build ignore

package main

import (
	"fmt"
)

// Func comment
func MyFuncTest(MyVar string) string {
	MyVar += " there" // This is a comment
	return MyVar
}

func main() {
	fmt.Println(MyFuncTest("Hi"))
}
