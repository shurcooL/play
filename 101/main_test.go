package main

import (
	"io/ioutil"
	"os"
	"os/exec"
	"testing"

	"github.com/shurcooL/play/101/format"
)

func Test(t *testing.T) {
	out, err := format.Source(in)
	if err != nil {
		panic(err)
	}

	if string(in) != string(out) {
		diff, err := diff(in, out)
		if err != nil {
			panic(err)
		}
		t.Errorf("diff:\n%s\n", diff)
	}
}

func TestRunMain(t *testing.T) {
	main()
}

func diff(b1, b2 []byte) (data []byte, err error) {
	f1, err := ioutil.TempFile("", "")
	if err != nil {
		return
	}
	defer os.Remove(f1.Name())
	defer f1.Close()

	f2, err := ioutil.TempFile("", "")
	if err != nil {
		return
	}
	defer os.Remove(f2.Name())
	defer f2.Close()

	f1.Write(b1)
	f2.Write(b2)

	data, err = exec.Command("diff", "-u", f1.Name(), f2.Name()).CombinedOutput()
	if len(data) > 0 {
		// diff exits with a non-zero status when the files don't match.
		// Ignore that failure as long as we get output.
		err = nil
	}
	return
}
