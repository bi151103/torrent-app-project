# Theo thao khảo từ NetApp, mỗi Peer hoạt động sẽ cần chạy đồng thời 2 host: server và client
## Host client: chạy ở socket: localhost:X, chịu trách nhiệm chạy ứng dụng giao diện để hiển thị thông tin các file được chia sẻ, tình trạng tải file và xử lý các thao tác upload và download file
## Host server: chạy ở socket: localhost:X+2000, chịu trách nhiệm chạy ứng dụng máy chủ (ứng với Peer đó) để xử lý việc lưu trữ các Piece đã tải, các torrent mà Peer đó đang tham gia cũng như lưu trữ tình trạng tải file ứng với torrent
## Ngoài ra còn có tracker chạy CỐ ĐỊNH ở socket: localhost:8001, chịu trách nhiệm lưu trữ thông tin có các file nào đang được chia sẻ và có Peer nào đang tham gia chia sẻ file đó

# VÍ DỤ: Giả sử ứng dụng đang có 2 Peer tham gia vào 1 torrent có infoHash là 'index.html' để tải file 'index.html' (tạm thời set infoHash là tên file cho dễ quan sát), thì sẽ có các host sau:
## Host tracker: localhost:8001
## Host client của Peer thứ nhất: localhost:7000
## Host server của Peer thứ nhất: localhost:9000
## Host client của Peer thứ hai: localhost:7001
## Host server của Peer thứ hai: localhost:9001

# Để chạy ứng dụng:
## Đầu tiên vào /backend và /frontend để install package bằng cách chạy lệnh npm install ở từng thư mục
## Để chạy tracker -> cd /backend -> chạy lệnh 'npm run dev:tracker' -> tracker được chạy ở localhost:8001
## Để chạy client của 1 Peer -> cd /frontend -> chạy lệnh 'npm run dev' -> client của Peer chạy ở localhost:7000
## Để chạy server của 1 Peer -> cd /backend -> chạy lệnh 'npm run dev:server' -> server của Peer chạy ở localhost:9000
## Để thao tác upload file và download file trên giao diện của ứng dụng 
- Mở trình duyệt, truy cập: localhost:7000, sau đó đăng nhập bằng tài khoản username: phuc.dang, password: phuc.dang
![image](https://github.com/user-attachments/assets/a339f8ca-cd20-4b46-a609-d70b5fb93ede)

- Có thể đăng ký mới tài khoản nếu muốn:
![image](https://github.com/user-attachments/assets/9a70cd74-56b4-4baf-8254-0ea4ff9210ca)
- Sau khi đã đăng nhập, nhấn 'Choose file' để upload file cần chia sẻ (những tài khoản Peer khác sau khi đăng nhập sẽ thấy file này)
  ![image](https://github.com/user-attachments/assets/a2bca03b-33eb-4575-9bc3-331b5a375103)

- Để chạy Peer thứ hai thì làm theo các bước chạy client và server ở trên (client và server Peer thứ hai sẽ được host ở localhost:7001 và localhost:9001), sau đó mở một tab mới của trình duyệt, truy cập localhost:7001
  ![image](https://github.com/user-attachments/assets/25d11c63-81e1-4684-a062-9ae7923dc8cc)

- Đăng nhập vào ứng dụng (có thể dùng tài khoản phuc.dang cũng được, chức năng đăng nhập đang làm sơ sài)
- Sau khi đăng nhập thì có thể thấy file lúc nãy được chia sẻ bởi Peer kia -> Bấm vào file, quan sát thống kê ở dưới và chờ đến khi nó tải xong
  ![image](https://github.com/user-attachments/assets/09b78492-c34d-4257-8daa-676fc15cff35)
- Tải xong thì sẽ chọn chỗ lưu như tải một file trên internet như bình thường (quan trọng là file tải xong vẫn mở lên xem được)
  ![image](https://github.com/user-attachments/assets/35c226a9-a00f-43dc-a27f-f386b340f4b6)

# NOTE: ứng dụng hiện tại chỉ hỗ trợ tải file từ 200MB trở xuống
## 1 PIECE trong ứng dụng hiện tại sẽ có kích thước là 512KB và 1 BLOCK sẽ có kích thước là 16KB. Như file được dùng ở trên có kích thước 102819045 bytes sẽ được phân mảnh thành 197 PIECEs
