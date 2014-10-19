package main

import (
	"fmt"
	"time"
)

func main() {
	for i := 0; i < 5; i++ {
		go fmt.Println(i)
		go func() {
			fmt.Println(i)
		}()
	}
	time.Sleep(time.Second)
}
