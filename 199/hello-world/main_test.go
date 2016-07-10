package main

import (
	"flag"
	"fmt"
	"os"
	"testing"
)

func TestMain(m *testing.M) {
	flag.Parse()
	fmt.Println("TestMain works!")
	os.Exit(m.Run())
}

func TestBasic(t *testing.T) {
	if 1+2 != 3 {
		t.Error("failed a basic test")
	}
}

func BenchmarkBasic(b *testing.B) {
	var x int
	for i := 0; i < b.N; i++ {
		x += i
	}
}

// Blocking on https://github.com/gopherjs/gopherjs/issues/381.
/*func Example_basic() {
	fmt.Println("basic main example!")

	// Output: basic main example!
}*/
