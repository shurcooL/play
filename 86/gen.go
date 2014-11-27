// +build ignore

package main

import "time"
import "fmt"
import "io/ioutil"

func main() {
	src := fmt.Sprintf(`package main; import ("fmt"; "os"); func init() { fmt.Println(%q); os.Exit(0) }`, time.Now().String())

	ioutil.WriteFile("./version.go", []byte(src), 0644)
}

