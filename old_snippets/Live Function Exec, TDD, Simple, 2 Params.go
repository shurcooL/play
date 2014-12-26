// +build ignore

package main

import (
	"fmt"
	"sort"
)

func MySort(a []int, b []int) (int, string) {
	sort.IntSlice(a).Sort()
	for x := range b {
		b[x] *= -1
	}

	return len(a), "text"
}

func MyGetString(args ...interface{}) string {
	var str string
	for index, arg := range args {
		str = str + fmt.Sprintf("%#v", arg) //VariableToGoSyntaxFormatted(arg)
		if (len(args) - 1 != index) {
			str = str + ", "
		}
	}
	return str
}

func main() {
	a, b := []int{2, 5, 3, 4, 1}, []int{-5, -6}

	out := MyGetString(MySort(a, b))
	in_after := MyGetString(a, b)

	fmt.Printf("(%s) (%s)", in_after, out)
}