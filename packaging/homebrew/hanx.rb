class Hanx < Formula
  desc "Local office document CLI, desktop setup, and MCP tools"
  homepage "https://hanx.io/"
  version "2.13.2"
  license "MIT"

  on_macos do
    url "https://github.com/FLOVER124/HanX/releases/download/v2.13.2/HanX-CLI-2.13.2-macOS.zip"
    sha256 "7a3c11f47ec205357ab6ff86eb8e7216278b46fe97c775c304c45b8b22477a8c"
    depends_on :macos => :ventura
  end
  on_linux do
    on_intel do
      url "https://github.com/FLOVER124/HanX/releases/download/v2.13.2/HanX-CLI-2.13.2-linux-x64.tar.gz"
      sha256 "1928b0ae3a5965dd1c06962ea7f657b10e4c303dbc5dff34782d62e6ab6ee090"
    end
  end
  depends_on "node"

  resource "setup" do
    url "https://github.com/FLOVER124/HanX/releases/download/v2.13.2/HanX-Setup-2.13.2.tar.gz"
    sha256 "287a632eb99b6fb655973eadf0b43737faf3948b974b13f84ecfce3ed94c4c82"
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
