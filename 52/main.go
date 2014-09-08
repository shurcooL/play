package main

import (
	"fmt"
	"go/format"
	"os/exec"
	"strings"

	"github.com/shurcooL/go/gists/gist5953185"
	format_work "github.com/shurcooL/go/go/format"
)

func main() {
	//const src = "                 func _() { panic(err); foo(); if err := bar(); err != nil { panic(err)}}"
	const src = "	 	func _() { panic(err); foo(`12\n3 foo`); \n\n\n // Comments are cool.\nif err := bar(); err != nil { panic(err)}}"

	fmt.Print(gist5953185.Underline(`"cmd/gofmt"`))
	{
		cmd := exec.Command("gofmt")
		cmd.Stdin = strings.NewReader(src)

		out, err := cmd.Output()
		if err != nil {
			panic(err)
		}

		fmt.Println(string(out))
		fmt.Printf("%q\n\n", string(out))
	}

	fmt.Print(gist5953185.Underline(`"go/format"`))
	{
		out, err := format.Source([]byte(src))
		if err != nil {
			panic(err)
		}

		fmt.Println(string(out))
		fmt.Printf("%q\n\n", string(out))
	}

	fmt.Print(gist5953185.Underline(`"go/format working"`))
	{
		out, err := format_work.Source([]byte(src))
		if err != nil {
			panic(err)
		}

		fmt.Println(string(out))
		fmt.Printf("%q\n\n", string(out))
	}
}
