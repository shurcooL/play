// Extract a .zip file.
package main

import (
	"archive/zip"
	"fmt"
	"os"
	"path/filepath"

	"github.com/shurcooL/go/u/u11"
)

func main() {
	r, err := zip.OpenReader("file.zip")
	if err != nil {
		panic(err)
	}
	defer r.Close()

	for _, f := range r.File {
		fmt.Printf("extracting %q into %q...", f.Name, filepath.Join(os.TempDir(), f.Name))
		rc, err := f.Open()
		if err != nil {
			panic(err)
		}
		u11.WriteFile(rc, filepath.Join(os.TempDir(), f.Name))
		rc.Close()
		fmt.Println("\ndone")
	}
}
