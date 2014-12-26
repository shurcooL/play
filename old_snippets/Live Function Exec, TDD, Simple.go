// +build ignore

package main

import (
	"fmt"
	"sort"
)

func MySort(a []int) (int, string) {
	sort.IntSlice(a).Sort()

	return len(a), "some textual output"
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
	a := []int{2, 5, 3, 4, 1}

	in_before := MyGetString(a)
	out := MyGetString(MySort(a))
	in_after := MyGetString(a)

	fmt.Printf("MySort(%s) -> %s\n", in_before, out)
	fmt.Printf("       %s", in_after)
}