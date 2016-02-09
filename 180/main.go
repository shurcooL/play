// Play with bcrypt.
package main

import (
	"fmt"

	"golang.org/x/crypto/bcrypt"
)

func main() {
	b0, err := bcrypt.GenerateFromPassword([]byte("asdf"), 11)
	if err != nil {
		panic(err)
	}
	b1, err := bcrypt.GenerateFromPassword([]byte("asdf"), 11)
	if err != nil {
		panic(err)
	}
	fmt.Printf("%s\n", b0)
	fmt.Printf("%s\n", b1)

	fmt.Println(bcrypt.CompareHashAndPassword(b1, []byte("asdf")))
}
