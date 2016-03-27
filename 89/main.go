// Extract a .zip file.
package main

import (
	"archive/zip"
	"fmt"
	"os"
	"path"
	"path/filepath"

	"github.com/shurcooL/go/ioutil"
)

func main() {
	r, err := zip.OpenReader("file.zip")
	if err != nil {
		panic(err)
	}
	defer r.Close()

	for _, f := range r.File {
		name := path.Base(f.Name)
		fmt.Printf("extracting %q into %q...", f.Name, filepath.Join(os.TempDir(), name))
		rc, err := f.Open()
		if err != nil {
			panic(err)
		}
		err = ioutil.WriteFile(rc, filepath.Join(os.TempDir(), name))
		if err != nil {
			panic(err)
		}
		err = rc.Close()
		if err != nil {
			panic(err)
		}
		fmt.Println("\ndone")
	}
}
