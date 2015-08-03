package main

import "fmt"

type T struct{ string }

func main() {
	c := make(chan T)
	go foo(c)
	fmt.Println(<-c)
}

func foo(c chan T) {
	var t T
	t.string = "Original"
	c <- t
	t.string = "Modified After Sending"
}
