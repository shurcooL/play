// Learn about blocking process execution by not reading its stdout.
package main

import (
	"bufio"
	"fmt"
	"log"
	"os/exec"
	"time"
)

func main() {
	err := run()
	if err != nil {
		log.Fatalln(err)
	}

	time.Sleep(10 * time.Second)
}

type w struct{}

func (w) Write(p []byte) (n int, err error) {
	time.Sleep(5 * time.Second)
	fmt.Printf("write: %q\n", string(p))
	return len(p), nil
}

func run() error {
	cmd := exec.Command("echo", "-n", "hello")

	bw := bufio.NewWriter(w{})

	cmd.Stdout = bw

	err := cmd.Run()
	fmt.Println("cmd done executing:", err)
	if err != nil {
		return err
	}

	err = bw.Flush()
	if err != nil {
		return err
	}

	return nil
}
