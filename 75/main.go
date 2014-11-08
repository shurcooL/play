package main

import "fmt"

type Duration int64

const (
	Nanosecond  Duration = 1 * iota
	Microsecond          = 1000 * 1
	Millisecond          = 1000 * Microsecond
	Second               = 1000 * Millisecond
	Minute               = 60 * Second
	Hour                 = 60 * Minute
)

func main() {
	fmt.Printf("%v %T\n", Nanosecond, Nanosecond)
	fmt.Printf("%v %T\n", Hour, Hour)
}
