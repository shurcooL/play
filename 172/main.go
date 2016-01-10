// Example package for https://github.com/tools/godep/issues/391.
package main

import (
	"fmt"
	"os"
)

func main() {
	_, err := assets.Open("foo.txt")
	fmt.Println(os.IsNotExist(err))
}
