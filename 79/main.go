package main

import (
	"fmt"
	"reflect"

	// Requires "experiment-with-bypass_alt" branch of github.com/shurcooL/go-goon.
	bypass_new "github.com/shurcooL/go-goon/bypass"
	bypass_alt "github.com/shurcooL/go-goon/bypass_alt"
	bypass_prev "github.com/shurcooL/go-goon/bypass_prev"
)

type stringer struct {
	a int
}

func (s *stringer) String() string {
	return fmt.Sprintf("stringer: %d", s.a)
}

func main() {
	var s = stringer{
		a: 5,
	}

	fmt.Println(s.String())

	var v = reflect.ValueOf(s)

	fmt.Println("can address with no code:                      ", v.CanAddr())
	fmt.Println("can address with alternative (modify in-place):", bypass_alt.UnsafeReflectValue(v).CanAddr())
	fmt.Println("can address with previous (1.3 only) code:     ", bypass_prev.UnsafeReflectValue(v).CanAddr())
	fmt.Println("can address with spew code:                    ", bypass_new.UnsafeReflectValue(v).CanAddr())

	// Notice since you can't get the address of it, you can't create a
	// pointer to it in order to invoke the Stringer (String method) on it.
	// Adding additional code to the bypass method to set the `flagAddr`
	// flag does _not_ work because the `ptr` is still nil and it thus
	// causes .Addr() to return a reflect.Value with nil instead of a
	// reflect.Value with the actual address, unlike the spew code.

	// Output:
	//stringer: 5
	//can address with no code:                       false
	//can address with alternative (modify in-place): false
	//can address with previous (1.3 only) code:      true
	//can address with spew code:                     true
}
