package main

import (
	"flag"
	"fmt"
)

func main() {
	flag.String("some-param", "default", "usage")

	fmt.Println("Hello.")
	flag.Parse()
	fmt.Println("Boom.")

	flag := 5
	fmt.Println(flag)
}
