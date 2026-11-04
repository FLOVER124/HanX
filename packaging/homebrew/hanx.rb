class Hanx < Formula
  desc "Local office document CLI, desktop setup, and MCP tools"
  homepage "https://hanx.io/"
  version "2.13.1"
  license "MIT"

  on_macos do
    url "https://github.com/FLOVER124/HanX/releases/download/v2.13.1/HanX-CLI-2.13.1-macOS.zip"
    sha256 "c5e2f218d27989a0cf646d4c317c449b747462c0d736dc95a2e67958a034af00"
    depends_on :macos => :ventura
  end
  on_linux do
    on_intel do
      url "https://github.com/FLOVER124/HanX/releases/download/v2.13.1/HanX-CLI-2.13.1-linux-x64.tar.gz"
      sha256 "0e3918ec73c81818cde0a6592e2057816b1e80ddc1f79cc0db8c5f9f932f16d1"
    end
  end
  depends_on "node"

  resource "setup" do
    url "https://github.com/FLOVER124/HanX/releases/download/v2.13.1/HanX-Setup-2.13.1.tar.gz"
    sha256 "1dc104602bc4e856d1ecb5f8c7608ed8659eaf584ecb5d7b87ebf545e19700f7"
  end

  def install
    platform = OS.mac? ? "darwin" : "linux"
    arch = Hardware::CPU.arm? ? "arm64" : "x64"
    native = libexec/"native/#{platform}-#{arch}"
    native.install Dir["*"]
    resource("setup").stage { libexec.install "bin", "lib", "package.json" }
    (bin/"hanx").write <<~SH
      #!/bin/sh
      exec "#{Formula["node"].opt_bin}/node" "#{libexec}/bin/hanx.js" "$@"
    SH
    bin.install_symlink "hanx" => "hanx-cli"
    pkgshare.install native/"LICENSE", native/"NOTICE"
  end

  def caveats
    <<~EOS
      CLI is ready. Run `hanx setup` to choose CLI only, GUI only, or both.
      Homebrew lifecycle installation never blocks on a prompt and never downloads a GUI.
      GUI-only keeps the small setup launcher and disables terminal document commands.
      The desktop app retains an internal engine. Linux GUI installation is per-user.
      PDF export may require a compatible local renderer; none is installed automatically.
    EOS
  end

  test do
    require "json"
    assert_equal version.to_s, JSON.parse(shell_output("#{bin}/hanx --version"))["data"]["version"]
    (testpath/"spec.json").write(JSON.generate({kind: "spreadsheet", sheets: [{name: "Data", rows: [[2], [4]], cells: {"B1" => "=SUM(A1:A2)"}}]}))
    system bin/"hanx", "create", "--spec", testpath/"spec.json", "--output", testpath/"test.xlsx"
    data = JSON.parse(shell_output("#{bin}/hanx spreadsheet read #{testpath}/test.xlsx --sheet Data --range B1"))
    assert_equal 6, data["data"]["cells"][0]["value"]
  end
end
