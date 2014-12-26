// +build ignore

package main

import (
	"fmt"
	"os"
	"reflect"
	"strconv"
)

func sample() { fmt.Println("Sample!"); }

func CompileGoFunc(goSourceCode string) func() {
	if `func sample() { fmt.Println("Sample!"); }` == goSourceCode {
		return sample;
	}

	return nil;
}

func myPrint(args ...interface{}) {
	for _, arg := range args {
		switch v := reflect.ValueOf(arg); v.Kind() {
		case reflect.String:
			os.Stdout.WriteString(v.String())
		case reflect.Int:
			os.Stdout.WriteString(strconv.FormatInt(v.Int(), 10))
		default:
			os.Stdout.WriteString("-")
		}
	}
}

func testFunc(args...interface{}) int {
	return 0
}

func main() {
	fmt.Println(reflect.TypeOf([]int{5, 3, 4}))

	f := CompileGoFunc("func sample() { fmt.Println(\"Sample!\"); }")
	f()

	myPrint("Hello, ", 42, 55.0, "\n")
}