// Learn about JSON unmarshaling into time.Time and *time.Time, how nulls are handled.
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/shurcooL/go-goon"
)

func main() {
	const in = `{"Foo": "some value",
				 "SomePtr": null,
				 "When": "2015-09-01T07:33:08.862Z",
	             "WhenPtr": null}`

	var v struct {
		Foo     string
		SomePtr *string
		When    time.Time
		WhenPtr *time.Time
	}

	err := json.Unmarshal([]byte(in), &v)
	if err != nil {
		log.Fatalln(err)
	}

	goon.DumpExpr(v)
	goon.DumpExpr(time.Since(v.When).String())

	fmt.Println(v.WhenPtr.IsZero())
}
