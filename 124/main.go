// Play with finding minimal time difference via subsequent calls to time.Now().
package main

import (
	"fmt"
	"time"
)

func timediff() time.Duration {
	t0 := time.Now()
	for {
		t := time.Now()
		if t != t0 {
			return t.Sub(t0)
		}
	}
}

func main() {
	var ds []time.Duration
	for i := 0; i < 10; i++ {
		ds = append(ds, timediff())
	}
	fmt.Printf("%v\n", ds)
}
