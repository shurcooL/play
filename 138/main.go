// +build darwin

// Reproduce case for "struct size calculation error" of https://github.com/go-gl/glfw/issues/136.
package main

/*
#cgo CFLAGS: -x objective-c

id foo() {
	return 0;
}
*/
import "C"

import "fmt"

func main() {
	fmt.Println(C.foo())
}
