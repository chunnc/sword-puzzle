using System;
using System.Collections;
using UnityEngine;
using UnityEngine.UIElements;
using KiemKhaiTienLo.Core;
using KiemKhaiTienLo.Presentation;

namespace KiemKhaiTienLo.App
{
    public sealed class GameApp : MonoBehaviour
    {
        private LocalSave save;
        private GameApi api;
        private RewardedAdsBridge ads;
        private BoardRenderer boardView;
        private BoardEngine board;
        private UIDocument document;
        private VisualElement root;
        private VisualElement screen;
        private Camera gameCamera;
        private Vector2 pointerStart;
        private bool pointerActive;
        private bool swordTargeting;
        private string notice = "";

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        private static void Launch()
        {
            if (FindFirstObjectByType<GameApp>() != null) return;
            var game = new GameObject("Kiếm Khai Tiên Lộ");
            DontDestroyOnLoad(game);
            game.AddComponent<GameApp>();
        }

        private void Awake()
        {
            Screen.orientation = ScreenOrientation.Portrait;
            Application.targetFrameRate = 60;
            save = new LocalSave();
            api = gameObject.AddComponent<GameApi>();
            ads = gameObject.AddComponent<RewardedAdsBridge>();
            gameCamera = Camera.main;
            if (gameCamera == null)
            {
                var cameraObject = new GameObject("Game Camera");
                cameraObject.tag = "MainCamera";
                gameCamera = cameraObject.AddComponent<Camera>();
            }
            gameCamera.orthographic = true;
            gameCamera.orthographicSize = 7.5f;
            gameCamera.transform.position = new Vector3(0, 0, -10);
            gameCamera.backgroundColor = new Color(.035f, .13f, .16f);
            gameCamera.clearFlags = CameraClearFlags.SolidColor;
            boardView = new GameObject("Puzzle Board").AddComponent<BoardRenderer>();
            boardView.transform.SetParent(transform, false);
            boardView.Initialize(gameCamera);
            document = gameObject.AddComponent<UIDocument>();
            document.panelSettings = Resources.Load<PanelSettings>("GamePanel");
            if (document.panelSettings == null)
                document.panelSettings = ScriptableObject.CreateInstance<PanelSettings>();
        }

        private void Start()
        {
            root = document.rootVisualElement;
            var style = Resources.Load<StyleSheet>("Game");
            if (style != null) root.styleSheets.Add(style);
            RenderMap();
            StartCoroutine(api.Bootstrap(() =>
            {
                if (api.RewardedAdsEnabled && api.Online) ads.Activate();
                StartCoroutine(SyncLoop());
            }));
        }

        private IEnumerator SyncLoop()
        {
            int delay = 5;
            while (true)
            {
                if (api.Online)
                {
                    if (!api.HasBootstrap) yield return api.Bootstrap(() => { });
                    if (api.RewardedAdsEnabled) ads.Activate();
                    int previousStars = save.TotalStars;
                    string failure = null;
                    yield return api.Sync(save, error => failure = error);
                    delay = failure == null ? 30 : Mathf.Min(delay * 2, 300);
                    if (failure == null && save.TotalStars != previousStars && board == null &&
                        screen != null && screen.name == "map") RenderMap();
                }
                else delay = 5;
                yield return new WaitForSeconds(delay);
            }
        }

        private void Update()
        {
            if (board == null || board.Won || board.Lost) return;
            if (Input.touchCount > 0)
            {
                var touch = Input.GetTouch(0);
                if (touch.phase == TouchPhase.Began) { pointerStart = touch.position; pointerActive = true; }
                if (pointerActive && (touch.phase == TouchPhase.Ended || touch.phase == TouchPhase.Canceled))
                { pointerActive = false; HandleBoardGesture(pointerStart, touch.position); }
            }
#if UNITY_EDITOR
            else
            {
                if (Input.GetMouseButtonDown(0)) { pointerStart = Input.mousePosition; pointerActive = true; }
                if (pointerActive && Input.GetMouseButtonUp(0))
                { pointerActive = false; HandleBoardGesture(pointerStart, Input.mousePosition); }
            }
#endif
        }

        private void HandleBoardGesture(Vector2 start, Vector2 end)
        {
            if (!boardView.CellFromScreen(start, out int x1, out int y1) ||
                !boardView.CellFromScreen(end, out int x2, out int y2)) return;
            bool changed;
            if (swordTargeting)
            {
                changed = board.UseSwordQi(y2);
                swordTargeting = false;
            }
            else changed = board.TrySwap(x1, y1, x2, y2);
            if (!changed) return;
            boardView.UpdateBoard(board);
            save.SaveBoard(board.Snapshot());
            if (board.Won)
            {
                int stars = board.Moves >= 6 ? 3 : board.Moves >= 2 ? 2 : 1;
                int levelId = board.Level.Id;
                save.Complete(levelId, stars);
                StartCoroutine(api.Sync(save, _ => { }));
                if (levelId % 20 == 0) RenderRealm(levelId);
                else RenderWin(levelId, stars);
            }
            else RenderGame();
        }

        private void StartLevel(int id, bool restart = false)
        {
            if (id > save.HighestUnlocked || id < 1 || id > LevelCatalog.Count) return;
            var previous = !restart && save.Active != null && save.Active.LevelId == id ? save.Active : null;
            board = new BoardEngine(LevelCatalog.Get(id), previous);
            swordTargeting = false;
            notice = "";
            save.SaveBoard(board.Snapshot());
            boardView.Show(board);
            RenderGame();
        }

        private void BeginScreen(bool gameplay)
        {
            root.Clear();
            screen = new VisualElement();
            screen.AddToClassList("screen");
            if (gameplay) screen.AddToClassList("game-screen");
            float scale = Screen.width > 0 ? 1080f / Screen.width : 1f;
            screen.style.paddingTop = 24f + Mathf.Max(0, Screen.height - Screen.safeArea.yMax) * scale;
            screen.style.paddingBottom = 24f + Mathf.Max(0, Screen.safeArea.yMin) * scale;
            root.Add(screen);
            if (!gameplay) boardView.Hide();
        }

        private void RenderMap()
        {
            board = null;
            BeginScreen(false);
            screen.name = "map";
            screen.Add(Label("KIẾM KHAI TIÊN LỘ", "title"));
            screen.Add(Label("Tu vi: " + save.Realm, "subtitle"));
            var top = new VisualElement(); top.AddToClassList("top-bar");
            top.Add(Button("Tài khoản", ShowAccount, "button-secondary"));
            top.Add(Button("Tiếp tục", () => StartLevel(save.Active != null ?
                save.Active.LevelId : save.HighestUnlocked), "button-primary"));
            screen.Add(top);
            var scroll = new ScrollView(); scroll.AddToClassList("scroll");
            string[] chapters = { "VÂN HẢI TIÊN SƠN", "HUYỀN KIẾM BÍ CẢNH", "LÔI HỎA THIÊN MÔN" };
            for (int chapter = 0; chapter < 3; chapter++)
            {
                scroll.Add(Label(chapters[chapter], "chapter"));
                for (int rowNumber = 0; rowNumber < 5; rowNumber++)
                {
                    var row = new VisualElement(); row.AddToClassList("row");
                    for (int column = 0; column < 4; column++)
                    {
                        int id = chapter * 20 + rowNumber * 4 + column + 1;
                        var stage = Button(id.ToString(), () => StartLevel(id), "stage-button");
                        if (save.Stars(id) > 0) stage.AddToClassList("stage-complete");
                        else if (id == save.HighestUnlocked) stage.AddToClassList("stage-current");
                        else if (id > save.HighestUnlocked) { stage.AddToClassList("stage-locked"); stage.SetEnabled(false); }
                        row.Add(stage);
                    }
                    scroll.Add(row);
                }
            }
            screen.Add(scroll);
            screen.Add(Label("Chọn một màn trên Tiên Lộ để bắt đầu.", "small"));
        }

        private void RenderGame()
        {
            if (board == null) return;
            BeginScreen(true);
            boardView.Show(board);
            var top = new VisualElement(); top.AddToClassList("card");
            top.Add(Label(board.Level.Goal == GoalKind.Boss ? "YÊU VƯƠNG" :
                board.Level.Goal == GoalKind.Battle ? "YÊU THÚ" : "BÍ CẢNH", "title"));
            top.Add(Label("Màn " + board.Level.Id + "  •  " + board.Level.Chapter, "small"));
            string objective = board.Level.Goal == GoalKind.Boss || board.Level.Goal == GoalKind.Battle ? "Máu yêu thú" :
                board.Level.Goal == GoalKind.BreakSeals ? "Phong ấn còn" : "Linh vật còn";
            top.Add(Label($"Lượt: {board.Moves}     {objective}: {board.Remaining}", "body"));
            if (board.Level.Goal == GoalKind.Boss || board.Level.Goal == GoalKind.Battle)
            {
                var track = new VisualElement(); track.AddToClassList("health-track");
                var fill = new VisualElement(); fill.AddToClassList("health-fill");
                fill.style.width = Length.Percent(Mathf.Clamp01((float)board.Remaining / board.Level.Target) * 100f);
                track.Add(fill); top.Add(track);
            }
            screen.Add(top);
            var spacer = new VisualElement(); spacer.AddToClassList("spacer"); screen.Add(spacer);
            if (!string.IsNullOrEmpty(notice)) screen.Add(Label(notice, "small"));
            var bottom = new VisualElement(); bottom.AddToClassList("card");
            bottom.Add(Label($"Kiếm khí  {board.SwordQi}/100", "body"));
            if (board.Lost)
            {
                bottom.Add(Label("Hết lượt — hãy thử lại", "subtitle"));
                bottom.Add(Button("Chơi lại", () => StartLevel(board.Level.Id, true), "button-primary"));
                if (!board.ExtraMovesUsed && api.Online && api.RewardedAdsEnabled && ads.Ready)
                    bottom.Add(Button("Xem quảng cáo: +3 lượt", RequestExtraMoves, "button-secondary"));
            }
            else
            {
                var row = new VisualElement(); row.AddToClassList("bottom-row");
                row.Add(Button("Tiên Lộ", RenderMap, "button-secondary"));
                var skill = Button(swordTargeting ? "Chọn hàng" : "Kiếm Trảm", () =>
                { if (board.SwordQi >= 100) { swordTargeting = true; notice = "Chạm một hàng trên bàn cờ"; RenderGame(); } }, "button-primary");
                skill.SetEnabled(board.SwordQi >= 100);
                row.Add(skill);
                bottom.Add(row);
            }
            screen.Add(bottom);
        }

        private void RequestExtraMoves()
        {
            BoardEngine currentBoard = board;
            StartCoroutine(api.CreateAdIntent(currentBoard.Level.Id, (intent, error) =>
            {
                if (board != currentBoard) return;
                if (error != null || intent == null)
                { notice = "Quảng cáo chưa sẵn sàng"; RenderGame(); return; }
                ads.Show(intent.customData, rewarded =>
                {
                    if (board != currentBoard) return;
                    if (rewarded && currentBoard.GrantExtraMoves())
                    {
                        save.SaveBoard(currentBoard.Snapshot());
                        notice = "+3 lượt";
                        StartCoroutine(api.CheckAdIntent(intent.intentId, (_, __) => { }));
                    }
                    else notice = "Chưa nhận được phần thưởng";
                    RenderGame();
                });
            }));
        }

        private void RenderWin(int levelId, int stars)
        {
            board = null;
            BeginScreen(false);
            screen.Add(new VisualElement { name = "space" });
            screen.Add(Label("VƯỢT ẢI THÀNH CÔNG", "title"));
            screen.Add(Label(new string('★', stars), "realm-symbol"));
            screen.Add(Label("Màn " + levelId + " đã hoàn thành", "subtitle"));
            screen.Add(Button("Màn tiếp theo", () => StartLevel(Math.Min(levelId + 1, LevelCatalog.Count)), "button-primary"));
            screen.Add(Button("Về Tiên Lộ", RenderMap, "button-secondary"));
        }

        private void RenderRealm(int completedLevel)
        {
            board = null;
            BeginScreen(false);
            var card = new VisualElement(); card.AddToClassList("realm-card");
            card.Add(Label("ĐỘT PHÁ TU VI", "title"));
            card.Add(Label("✧  ⚔  ✧", "realm-symbol"));
            card.Add(Label("Cảnh giới mới: " + save.Realm, "subtitle"));
            card.Add(Label("Một vùng đất mới đã mở trên Tiên Lộ", "body"));
            screen.Add(card);
            screen.Add(Button("Tiếp tục hành trình", RenderMap, "button-primary"));
        }

        private void ShowAccount()
        {
            board = null;
            BeginScreen(false);
            screen.Add(Label("TÀI KHOẢN KIẾM TU", "title"));
            screen.Add(Label(api.Session == null || api.Session.isGuest ?
                "Liên kết để đồng bộ giữa iOS và Android" : "Đã liên kết tài khoản", "subtitle"));
            var email = new TextField("Email"); email.AddToClassList("input");
            var password = new TextField("Mật khẩu") { isPasswordField = true }; password.AddToClassList("input");
            screen.Add(email); screen.Add(password);
            var status = Label("", "small"); screen.Add(status);
            screen.Add(Button("Tạo tài khoản", () => StartCoroutine(api.Register(email.value, password.value,
                error => AccountResult(error, status))), "button-primary"));
            screen.Add(Button("Đăng nhập", () => StartCoroutine(api.Login(email.value, password.value,
                error => AccountResult(error, status))), "button-secondary"));
            screen.Add(Button("Quay lại", RenderMap, "button-secondary"));
            screen.Add(Label("Bản đầu chưa có xác minh email hoặc khôi phục mật khẩu.", "small"));
        }

        private void AccountResult(string error, Label status)
        {
            if (error != null) { status.text = "Không thể đăng nhập: " + error; return; }
            StartCoroutine(api.Sync(save, _ => RenderMap()));
        }

        private void OnApplicationPause(bool paused)
        {
            if (paused && board != null && !board.Won) save.SaveBoard(board.Snapshot());
        }

        private static Label Label(string text, string className)
        {
            var label = new Label(text); label.AddToClassList(className); return label;
        }

        private static Button Button(string text, Action action, string className)
        {
            var button = new Button(action) { text = text };
            button.AddToClassList(className);
            return button;
        }
    }
}
