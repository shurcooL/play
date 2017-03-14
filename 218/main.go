// Test program for https://github.com/gopherjs/gopherjs/issues/603.
package main

import "fmt"
import "time"

func f() (err error) {
	defer func() {
		time.Sleep(time.Second)
	}()
	return nil
}

func main() {
	err := f()
	fmt.Println(err) // prints "<nil>" which is correct
}
