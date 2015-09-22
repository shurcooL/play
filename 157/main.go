//go:generate -command asset go run asset.go
//go:generate asset sample.txt

package main

import "fmt"

func txt(a asset) string {
	return a.Content
}

func main() {
	fmt.Println("sample.txt:", sample)
}
