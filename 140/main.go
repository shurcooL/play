package main

import "github.com/shurcooL/go-goon"

func main() {
	var sum uint64

	for i := uint64(1); i < 1000; i++ {
		if x(i) {
			sum += i
		}
	}

	goon.DumpExpr(sum)
}

func x(i uint64) bool {
	return i%3 == 0 || i%5 == 0
}
