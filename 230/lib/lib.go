package lib

import (
	"fmt"

	"github.com/shurcooL/play/230/p"
)

type (
	NN p.N
	AN = p.N

	NA p.A
	AA = p.A
)

type X struct {
	S string
}

type A = X

func (a A) Method() string {
	return "method: " + a.S
}

func DoStuff() {
	var nn NN = "value"
	fmt.Printf("%T %v\n", nn, nn)

	var an AN = "value"
	fmt.Printf("%T %v\n", an, an)

	var na NA = "value"
	fmt.Printf("%T %v\n", na, na)

	var aa AA = "value"
	fmt.Printf("%T %v\n", aa, aa)
}
