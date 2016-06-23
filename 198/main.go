// command-spy is a wrapper around a command that intercepts the stdin/stdout/stderr streams
// and copies them to a temporary directory.
package main

import (
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
)

const targetCommand = "some-command"

func run() (int, error) {
	dir, err := ioutil.TempDir("/tmp/dashboard", "command-spy_")
	if err != nil {
		return 0, err
	}

	out := fmt.Sprintf("os.Args[0]:  %#q\n", os.Args[0])  // Program name.
	out += fmt.Sprintf("os.Args[1:]: %#q\n", os.Args[1:]) // Program arguments.
	wd, err := os.Getwd()
	if err != nil {
		return 0, err
	}
	out += fmt.Sprintf("os.Getwd():  %#q\n", wd) // Current working directory.

	err = ioutil.WriteFile(filepath.Join(dir, "args.txt"), []byte(out), 0644)
	if err != nil {
		return 0, err
	}

	stdin, err := os.Create(filepath.Join(dir, "stdin.txt"))
	if err != nil {
		return 0, err
	}
	defer stdin.Close()
	stdout, err := os.Create(filepath.Join(dir, "stdout.txt"))
	if err != nil {
		return 0, err
	}
	defer stdout.Close()
	stderr, err := os.Create(filepath.Join(dir, "stderr.txt"))
	if err != nil {
		return 0, err
	}
	defer stderr.Close()

	cmd := exec.Command(targetCommand, os.Args[1:]...)
	cmd.Stdin = io.TeeReader(os.Stdin, stdin)
	cmd.Stdout = io.MultiWriter(os.Stdout, stdout)
	cmd.Stderr = io.MultiWriter(os.Stderr, stderr)
	err = cmd.Run()
	if err, ok := err.(*exec.ExitError); ok {
		return err.Sys().(syscall.WaitStatus).ExitStatus(), nil
	}
	return 0, nil
}

func main() {
	exitCode, err := run()
	if err != nil {
		log.Fatalln(err)
	}
	os.Exit(exitCode)
}
