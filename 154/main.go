// Play with experimental use of initialization order to do dependency resolution.
package main

import "fmt"

// A   D
//  \   \
//   C - X - Z
//  /
// B

var initZ = func() struct{} {
	_ = initX
	fmt.Println("init Z")
	return struct{}{}
}()

var initA = func() struct{} {
	fmt.Println("init A")
	return struct{}{}
}()

var initB = func() struct{} {
	fmt.Println("init B")
	return struct{}{}
}()

var initC = func() struct{} {
	_, _ = initA, initB
	fmt.Println("init C")
	return struct{}{}
}()

var initD = func() struct{} {
	fmt.Println("init D")
	return struct{}{}
}()

var initX = func() struct{} {
	_, _ = initC, initD
	fmt.Println("init X")
	return struct{}{}
}()

func main() {
}
