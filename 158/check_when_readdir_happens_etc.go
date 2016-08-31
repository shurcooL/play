// Check when Readdir happens.
//
// It happens when first Readdir is called, not when Open is called for the directory.
package main

import (
	"fmt"
	"io"
	"os"
	"time"
)

func main() {
	f, err := os.Open("/Users/Dmitri/Desktop")
	if err != nil {
		panic(err)
	}

	fis, err := f.Readdir(1)
	if err != nil {
		panic(err)
	}
	for _, fi := range fis {
		fmt.Println(fi.Name())
	}

	time.Sleep(10 * time.Second)

	fis, err = f.Readdir(0)
	if err != nil {
		panic(err)
	}
	for _, fi := range fis {
		fmt.Println(fi.Name())
	}

	fis, err = f.Readdir(0)
	if err != nil {
		panic(err)
	}
	fmt.Println(len(fis))

	f.Seek(0, io.SeekStart)

	fis, err = f.Readdir(0)
	if err != nil {
		panic(err)
	}
	for _, fi := range fis {
		fmt.Println(fi.Name())
	}
}
